import datetime
from rest_framework import generics, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.common.company_scope import filter_queryset_by_company
from apps.common.permissions import RoleBasedAccessPermission
from .models import Leave
from .serializers import LeaveSerializer


class CanManageLeaves(RoleBasedAccessPermission):
    message = "You do not have permission to manage leave records."


class LeaveListCreateView(generics.ListCreateAPIView):
    serializer_class = LeaveSerializer
    permission_classes = [CanManageLeaves]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = Leave.objects.select_related(
            'personnel', 'employment', 'employment__company', 'company', 'created_by'
        )
        status_f = self.request.query_params.get('status')
        personnel_f = self.request.query_params.get('personnel')
        if status_f:
            qs = qs.filter(status=status_f)
        if personnel_f:
            qs = qs.filter(personnel_id=personnel_f)
        qs = filter_queryset_by_company(
            qs, field="company", raw=self.request.query_params.get("company")
        )
        search = self.request.query_params.get('search')
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(personnel__first_name__icontains=search)
                | Q(personnel__last_name__icontains=search)
                | Q(employment__company__name__icontains=search)
                | Q(company__name__icontains=search)
                | Q(leave_type__icontains=search)
                | Q(decision_number__icontains=search)
                | Q(reason__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class LeaveDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = LeaveSerializer
    permission_classes = [CanManageLeaves]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return Leave.objects.select_related(
            'personnel', 'employment', 'employment__company', 'company', 'created_by'
        )

    def destroy(self, request, *args, **kwargs):
        leave = self.get_object()
        if leave.status == Leave.STATUS_OFFICIAL:
            return Response(
                {'error': 'Cannot delete an official leave. Cancel it first.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)


class LeaveMarkOfficialView(APIView):
    permission_classes = [CanManageLeaves]

    def post(self, request, pk):
        try:
            leave = Leave.objects.get(pk=pk)
        except Leave.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if leave.status != Leave.STATUS_DRAFT:
            return Response({'error': f'Leave is already {leave.status}.' }, status=status.HTTP_400_BAD_REQUEST)
        leave.status = Leave.STATUS_OFFICIAL
        leave.official_at = datetime.datetime.now(datetime.timezone.utc)
        leave.save()
        return Response(LeaveSerializer(leave).data)


class LeaveCancelView(APIView):
    permission_classes = [CanManageLeaves]

    def post(self, request, pk):
        try:
            leave = Leave.objects.get(pk=pk)
        except Leave.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if leave.status == Leave.STATUS_CANCELLED:
            return Response({'error': 'Already cancelled.'}, status=status.HTTP_400_BAD_REQUEST)
        leave.status = Leave.STATUS_CANCELLED
        leave.cancelled_at = datetime.datetime.now(datetime.timezone.utc)
        leave.save()
        return Response(LeaveSerializer(leave).data)
