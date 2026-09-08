from django.urls import path
from . import views

urlpatterns = [
    path('tickets/', views.HelpTicketCreateView.as_view(), name='ticket-create'),
    path('tickets/list/', views.HelpTicketListView.as_view(), name='ticket-list'),
    path('tickets/<int:pk>/', views.HelpTicketDetailView.as_view(), name='ticket-detail'),
    path('tickets/<int:pk>/reply/', views.HelpTicketReplyView.as_view(), name='ticket-reply'),
    path('client-tickets/', views.ClientTicketCreateView.as_view(), name='client-ticket-create'),
    path('client-tickets/list/', views.ClientTicketListView.as_view(), name='client-ticket-list'),
    path('client-tickets/<int:pk>/', views.ClientTicketDetailView.as_view(), name='client-ticket-detail'),
    path('client-tickets/<int:pk>/reply/', views.ClientTicketReplyView.as_view(), name='client-ticket-reply'),
    path(
        'client-tickets/<int:pk>/attachments/<int:attachment_id>/download/',
        views.ClientTicketAttachmentDownloadView.as_view(),
        name='client-ticket-attachment-download',
    ),
]
