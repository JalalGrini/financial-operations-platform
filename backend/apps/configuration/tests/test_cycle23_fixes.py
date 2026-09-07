# apps/configuration/tests/test_cycle23_fixes.py
"""Regression tests for the Cycle 23 fix (state/IMPLEMENTATION_PLAN.md
Section 17): N-2, the category list endpoint's recursive "children"
serialization and per-ancestor "full_path" resolution each cost roughly one
query per tree node beyond the first prefetched level, scaling with tree
size/depth instead of page size.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APITestCase

from apps.configuration.models import Category

User = get_user_model()

CATEGORIES_URL = "/api/v1/configuration/categories/"


class Cycle23CategoryListBulkMapTests(APITestCase):
    """N-2: list endpoint query count must not scale with tree depth/size,
    and full_path/children must still be correct."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email="c23-cat-admin@example.com",
            password="testpass123",
            first_name="Cycle23",
            last_name="Admin",
        )
        group, _created = Group.objects.get_or_create(name="Administrator")
        cls.admin.groups.add(group)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def _make_chain(self, prefix, depth):
        """Create a linear parent->child->grandchild... chain `depth` deep and
        return the list of created categories, root first."""
        chain = []
        parent = None
        for i in range(depth):
            node = Category.objects.create(
                name=f"{prefix}-{i}",
                parent=parent,
                created_by=self.admin,
                updated_by=self.admin,
            )
            chain.append(node)
            parent = node
        return chain

    def test_list_query_count_does_not_scale_with_tree_depth(self):
        # Two non-empty states: a shallow 2-level chain, then the same root
        # extended into a much deeper chain plus a second independent chain.
        # Only ROOT-level categories are returned as top-level list rows (the
        # rest come back nested under "children"), so the number of top-level
        # rows stays the same (2 roots) across both requests; only depth and
        # total node count change.
        self._make_chain("shallow", depth=2)

        with CaptureQueriesContext(connection) as ctx1:
            response1 = self.client.get(CATEGORIES_URL)
        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        results1 = response1.data["results"] if "results" in response1.data else response1.data
        top_level_1 = [row for row in results1 if row["parent"] is None]
        self.assertEqual(len(top_level_1), 1)
        baseline_queries = len(ctx1.captured_queries)

        # Make the tree much bigger and deeper: extend the existing chain and
        # add a second, deep, independent chain.
        self._make_chain("deep", depth=8)

        with CaptureQueriesContext(connection) as ctx2:
            response2 = self.client.get(CATEGORIES_URL)
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        results2 = response2.data["results"] if "results" in response2.data else response2.data
        top_level_2 = [row for row in results2 if row["parent"] is None]
        self.assertEqual(len(top_level_2), 2)

        self.assertEqual(
            len(ctx2.captured_queries),
            baseline_queries,
            "List endpoint query count changed after growing the category "
            "tree; children/full_path resolution must use the bulk maps, "
            "not one query per node (N-2 regression).",
        )

    def test_full_path_and_children_correctness_with_deep_chain(self):
        chain = self._make_chain("chain", depth=4)
        root, child1, child2, child3 = chain

        response = self.client.get(CATEGORIES_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        root_row = next(row for row in results if row["id"] == str(root.id))

        # full_path for the root is just its own name.
        self.assertEqual(root_row["full_path"], root.get_full_path())

        # Walk down the nested children to the deepest node and check its
        # full_path against the model's own (unmapped) computation.
        node = root_row
        for expected_child in (child1, child2, child3):
            self.assertEqual(len(node["children"]), 1)
            node = node["children"][0]
            self.assertEqual(node["id"], str(expected_child.id))
            self.assertEqual(node["full_path"], expected_child.get_full_path())
        self.assertEqual(node["children"], [])
