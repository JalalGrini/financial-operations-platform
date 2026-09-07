# apps/dashboard
"""Executive Dashboard.

Read-only aggregation over Financial Records and Reports. Deliberately has
no models.py and no migrations - blueprint 05_Domain_Model.md Section 3.14:
"Dashboards never store business data." See state/IMPLEMENTATION_PLAN.md
Section 16 (decision ED-1) for the full reasoning.
"""
