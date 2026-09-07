"""Project-wide pagination.

DRF's stock ``PageNumberPagination`` only honours a ``page_size`` query
parameter when ``page_size_query_param`` is set. It was never set, so every
list endpoint silently ignored the ``page_size`` the frontend sends and
always returned ``PAGE_SIZE`` (20) rows - the per-page selector on every
list page changed nothing. This subclass turns that contract on and caps the
page size so a crafted request cannot pull an unbounded result set.
"""

from rest_framework.pagination import PageNumberPagination


class StandardResultsPagination(PageNumberPagination):
    # Default comes from REST_FRAMEWORK["PAGE_SIZE"] (20).
    page_size_query_param = "page_size"
    max_page_size = 200
