from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("companies", "0005_company_complementary_fields"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="company",
            name="unique_company_tax_id",
        ),
        migrations.RemoveConstraint(
            model_name="company",
            name="unique_company_vat_number",
        ),
        migrations.RemoveConstraint(
            model_name="company",
            name="unique_company_reg_number",
        ),
        migrations.AlterField(
            model_name="company",
            name="registration_number",
            field=models.CharField(
                blank=True,
                help_text="Official company registration number",
                max_length=100,
                null=True,
                verbose_name="registration number",
            ),
        ),
        migrations.AlterField(
            model_name="company",
            name="tax_id",
            field=models.CharField(
                blank=True,
                help_text="Tax identification number",
                max_length=100,
                null=True,
                verbose_name="tax ID",
            ),
        ),
        migrations.AlterField(
            model_name="company",
            name="vat_number",
            field=models.CharField(
                blank=True,
                help_text="Identifiant Commun de l'Entreprise (ICE)",
                max_length=100,
                null=True,
                verbose_name="Identifiant Commun de l'Entreprise",
            ),
        ),
    ]
