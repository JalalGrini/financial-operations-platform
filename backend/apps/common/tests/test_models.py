# apps/common/tests/test_models.py
"""
Tests for common app abstract models and managers.
"""
import uuid

from django.db import connection, models
from django.test import TestCase

from apps.common.models import (
    ActiveManager,
    ActiveQuerySet,
    ArchivedManager,
    ArchiveModel,
    ReferenceModel,
    TimeStampedModel,
    UUIDModel,
)


def _create_table(model):
    """Create the database table for an unmanaged test model."""
    with connection.schema_editor() as editor:
        editor.create_model(model)


def _drop_table(model):
    """Drop the database table for an unmanaged test model, ignoring errors."""
    try:
        with connection.schema_editor() as editor:
            editor.delete_model(model)
    except Exception:
        pass


class ConcreteUUIDModel(UUIDModel):
    """Concrete model for testing UUIDModel."""

    name = models.CharField(max_length=100)

    class Meta:
        app_label = "common"
        # Test-only model: do not let migrate --run-syncdb create this before
        # the real accounts migration has created accounts_user.
        managed = False


class ConcreteTimeStampedModel(TimeStampedModel):
    """Concrete model for testing TimeStampedModel."""

    name = models.CharField(max_length=100)

    class Meta:
        app_label = "common"
        # Test-only model: do not let migrate --run-syncdb create this before
        # the real accounts migration has created accounts_user.
        managed = False


class ConcreteArchiveModel(ArchiveModel):
    """Concrete model for testing ArchiveModel."""

    name = models.CharField(max_length=100)

    class Meta:
        app_label = "common"
        # Test-only model: do not let migrate --run-syncdb create this before
        # the real accounts migration has created accounts_user.
        managed = False


class ConcreteReferenceModel(ReferenceModel):
    """Concrete model for testing ReferenceModel."""

    name = models.CharField(max_length=100)

    def generate_reference(self):
        return f"REF-{uuid.uuid4().hex[:8].upper()}"

    class Meta:
        app_label = "common"
        # Test-only model: do not let migrate --run-syncdb create this before
        # the real accounts migration has created accounts_user.
        managed = False


class UUIDModelTests(TestCase):
    """Tests for UUIDModel."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        _create_table(ConcreteUUIDModel)

    @classmethod
    def tearDownClass(cls):
        _drop_table(ConcreteUUIDModel)
        super().tearDownClass()

    def test_uuid_primary_key(self):
        """Test that id is UUID and auto-generated."""
        obj = ConcreteUUIDModel.objects.create(name="Test")
        self.assertIsInstance(obj.id, uuid.UUID)
        self.assertIsNotNone(obj.id)

    def test_uuid_is_primary_key(self):
        """Test that UUID is the primary key field."""
        obj = ConcreteUUIDModel.objects.create(name="Test")
        self.assertEqual(obj.pk, obj.id)


class TimeStampedModelTests(TestCase):
    """Tests for TimeStampedModel."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        _create_table(ConcreteTimeStampedModel)

    @classmethod
    def tearDownClass(cls):
        _drop_table(ConcreteTimeStampedModel)
        super().tearDownClass()

    def test_created_at_auto_set(self):
        """Test that created_at is set on creation."""
        obj = ConcreteTimeStampedModel.objects.create(name="Test")
        self.assertIsNotNone(obj.created_at)

    def test_updated_at_auto_updated(self):
        """Test that updated_at changes on save."""
        obj = ConcreteTimeStampedModel.objects.create(name="Test")
        original_updated = obj.updated_at
        obj.name = "Updated"
        obj.save()
        self.assertNotEqual(obj.updated_at, original_updated)


class ArchiveModelTests(TestCase):
    """Tests for ArchiveModel and managers."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        _create_table(ConcreteArchiveModel)

    @classmethod
    def tearDownClass(cls):
        _drop_table(ConcreteArchiveModel)
        super().tearDownClass()

    def test_default_not_archived(self):
        """Test that new instances are not archived by default."""
        obj = ConcreteArchiveModel.objects.create(name="Test")
        self.assertFalse(obj.is_archived)
        self.assertIsNone(obj.archived_at)

    def test_archive_method(self):
        """Test archive() method sets fields correctly."""
        obj = ConcreteArchiveModel.objects.create(name="Test")
        obj.archive()
        self.assertTrue(obj.is_archived)
        self.assertIsNotNone(obj.archived_at)

    def test_archive_method_with_user(self):
        """Test archive() with user."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        user = User.objects.create_user(email="test@example.com", password="pass")
        obj = ConcreteArchiveModel.objects.create(name="Test")
        obj.archive(user=user)
        self.assertEqual(obj.archived_by, user)

    def test_restore_method(self):
        """Test restore() method clears archive fields."""
        obj = ConcreteArchiveModel.objects.create(name="Test")
        obj.archive()
        obj.restore()
        self.assertFalse(obj.is_archived)
        self.assertIsNone(obj.archived_at)
        self.assertIsNone(obj.archived_by)

    def test_active_manager_excludes_archived(self):
        """Test that ActiveManager excludes archived instances."""
        active = ConcreteArchiveModel.objects.create(name="Active")
        archived = ConcreteArchiveModel.objects.create(name="Archived")
        archived.archive()

        active_qs = ConcreteArchiveModel.objects.all()
        self.assertEqual(active_qs.count(), 1)
        self.assertEqual(active_qs.first(), active)

    def test_all_objects_manager_includes_archived(self):
        """Test that all_objects manager includes archived instances."""
        ConcreteArchiveModel.objects.create(name="Active")
        archived = ConcreteArchiveModel.objects.create(name="Archived")
        archived.archive()

        all_qs = ConcreteArchiveModel.all_objects.all()
        self.assertEqual(all_qs.count(), 2)


class ReferenceModelTests(TestCase):
    """Tests for ReferenceModel."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        _create_table(ConcreteReferenceModel)

    @classmethod
    def tearDownClass(cls):
        _drop_table(ConcreteReferenceModel)
        super().tearDownClass()

    def test_reference_generated_on_save(self):
        """Test that reference is generated if not provided."""
        obj = ConcreteReferenceModel.objects.create(name="Test")
        self.assertIsNotNone(obj.reference)
        self.assertTrue(obj.reference.startswith("REF-"))

    def test_custom_reference_preserved(self):
        """Test that provided reference is not overwritten."""
        obj = ConcreteReferenceModel.objects.create(name="Test", reference="CUSTOM-REF-001")
        self.assertEqual(obj.reference, "CUSTOM-REF-001")

    def test_reference_unique(self):
        """Test that reference field is unique."""
        ConcreteReferenceModel.objects.create(name="Test 1", reference="UNIQUE-001")
        with self.assertRaises(Exception) as cm:
            ConcreteReferenceModel.objects.create(name="Test 2", reference="UNIQUE-001")
        self.assertIn("unique", str(cm.exception).lower())


class ManagerTests(TestCase):
    """Tests for custom managers."""

    def test_active_manager_filters_correctly(self):
        """Test ActiveManager returns only active items."""
        manager = ActiveManager()
        self.assertEqual(manager.model, None)

    def test_archived_manager_filters_correctly(self):
        """Test ArchivedManager returns only archived items."""
        manager = ArchivedManager()
        self.assertEqual(manager.model, None)

    def test_active_queryset_methods(self):
        """Test ActiveQuerySet active() and archived() methods."""
        qs = ActiveQuerySet(model=ConcreteArchiveModel)
        self.assertTrue(hasattr(qs, "active"))
        self.assertTrue(hasattr(qs, "archived"))
