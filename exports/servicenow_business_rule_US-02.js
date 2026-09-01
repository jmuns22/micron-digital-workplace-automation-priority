// ============================================================
// ServiceNow Business Rule (illustrative): Validate Equipment Request
// Table: u_equipment_request
// When: before, on insert and update
// Condition: current.state == 'submitted'
//
// Derived directly from BR-1 through BR-5 in Functional_Spec_US-02
// (Project_Delivery_Plan.xlsx). Written to show translation from
// BA requirements into ServiceNow's actual scripting model, not
// tested against a live instance.
// ============================================================

(function executeRule(current, previous /*null when async*/) {

    var deptBudget = new GlideRecord('u_department_budget');
    deptBudget.addQuery('cost_center', current.cost_center);
    deptBudget.addQuery('fiscal_quarter', gs.getCurrentFiscalQuarter());
    deptBudget.query();

    if (!deptBudget.next()) {
        // Exception handling: budget data unavailable (functional spec, section 6)
        current.u_validation_status = 'data_pending';
        current.work_notes = 'Budget data unavailable for this cost center. ' +
            'Routed to Finance Systems Liaison, 24-hour SLA per R-02 in the risk tracker.';
        current.update();
        return;
    }

    // BR-5: remaining budget = approved quarterly budget minus already-committed spend
    var remainingBudget = deptBudget.u_approved_quarterly_budget - deptBudget.u_committed_spend;

    var catalogItem = new GlideRecord('u_approved_catalog');
    catalogItem.addQuery('sku', current.u_requested_sku);
    catalogItem.query();
    var isCatalogItem = catalogItem.next();

    var overBudget = current.u_requested_cost > remainingBudget;

    if (isCatalogItem && !overBudget) {
        // BR-1: clean case, no manual review needed
        current.u_validation_status = 'auto_approved_pending_routing';

    } else if (overBudget && !isCatalogItem) {
        // BR-4: both conditions true, highest-friction case
        current.u_validation_status = 'combined_review_required';
        current.work_notes = 'Over budget AND non-catalog item. ' +
            'Routed to manager, Finance Systems Liaison, and Digital Workplace analyst.';

    } else if (overBudget) {
        // BR-2
        current.u_validation_status = 'budget_review_required';
        current.work_notes = 'Cost exceeds remaining quarterly budget. ' +
            'Routed to manager and Finance Systems Liaison.';

    } else if (!isCatalogItem) {
        // BR-3
        current.u_validation_status = 'policy_review_required';
        current.work_notes = 'Non-standard catalog item. ' +
            'Routed to manager with policy-exception note.';
    }

    // Output requirement: audit log entry, per functional spec section 5
    gs.eventQueue('equipment_request.validation_complete', current,
        current.u_validation_status, gs.nowDateTime());

})(current, previous);
