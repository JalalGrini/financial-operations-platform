# apps/personnel/__init__.py
"""
Personnel Domain App.

Implements the Personnel domain for EFOP:
- PersonnelPerson: Real physical person
- Employment: Relationship between Person and Company
- EmploymentSalary: Salary history
- MonthlyPayrollRecord: Monthly payroll
- PayrollAdjustment: Supplements/deductions
- PayrollPayment: Payments and advances
- CNSSDeclaration: CNSS registration
- CNSSMonthlyDeclaration: Monthly CNSS declarations
- Reports: CNSS monthly, Personnel/Payroll monthly
"""
default_app_config = "apps.personnel.apps.PersonnelConfig"
