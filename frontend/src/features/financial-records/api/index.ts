import { apiClient } from "@/lib/api";
import type {
  CustomFieldContract,
  FinancialDocumentTemplate,
  FinancialRecord,
  FinancialRecordAttachment,
  FinancialRecordCreateInput,
  FinancialRecordLine,
  FinancialRecordLineInput,
  PaginatedResponse,
  TemplateWriteInput,
} from "../types";

type Params = Record<string, string | number | boolean | undefined>;

function buildQuery(params: Params): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  });
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

const recordsBase = "/financial-records/records";
const templatesBase = "/financial-records/templates";

export const financialRecordsApi = {
  list: (params: Params = {}) =>
    apiClient.get<PaginatedResponse<FinancialRecord>>(
      `${recordsBase}/${buildQuery(params)}`,
    ),
  get: (id: string) => apiClient.get<FinancialRecord>(`${recordsBase}/${id}/`),
  create: (data: FinancialRecordCreateInput) =>
    apiClient.post<FinancialRecord>(`${recordsBase}/`, data),
  update: (id: string, data: Partial<FinancialRecordCreateInput>) =>
    apiClient.patch<FinancialRecord>(`${recordsBase}/${id}/`, data),
  post: (id: string) =>
    apiClient.post<FinancialRecord>(`${recordsBase}/${id}/post_to_ledger/`, {}),
  cancel: (id: string, reason: string) =>
    apiClient.post<FinancialRecord>(`${recordsBase}/${id}/cancel/`, { reason }),
  archive: (id: string) =>
    apiClient.post<{ message: string }>(`${recordsBase}/${id}/archive/`, {}),
  restore: (id: string) =>
    apiClient.post<{ message: string }>(`${recordsBase}/${id}/restore/`, {}),
  customFieldContract: (recordType: string) =>
    apiClient.get<CustomFieldContract>(
      `${recordsBase}/custom-field-definitions/${buildQuery({ record_type: recordType })}`,
    ),
  customFieldDefinitions: async (params: { record_type: string }) => {
    const contract = await financialRecordsApi.customFieldContract(
      params.record_type,
    );
    return contract.definitions;
  },
  addLine: (recordId: string, data: FinancialRecordLineInput) =>
    apiClient.post<FinancialRecordLine>(
      `${recordsBase}/${recordId}/lines/`,
      data,
    ),
  updateLine: (
    recordId: string,
    lineId: string,
    data: Partial<FinancialRecordLineInput>,
  ) =>
    apiClient.patch<FinancialRecordLine>(
      `${recordsBase}/${recordId}/lines/${lineId}/`,
      data,
    ),
  deleteLine: (recordId: string, lineId: string) =>
    apiClient.delete<void>(`${recordsBase}/${recordId}/lines/${lineId}/`),
  uploadAttachment: (recordId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiClient.post<FinancialRecordAttachment>(
      `${recordsBase}/${recordId}/attachments/`,
      body,
    );
  },
  registerAttachment: (
    recordId: string,
    data: {
      file_key: string;
      file_name: string;
      content_type?: string;
      size_bytes?: number;
    },
  ) =>
    apiClient.post<FinancialRecordAttachment>(
      `${recordsBase}/${recordId}/attachments/`,
      data,
    ),
  deleteAttachment: (recordId: string, attachmentId: string) =>
    apiClient.delete<void>(
      `${recordsBase}/${recordId}/attachments/${attachmentId}/`,
    ),
};

export const financialTemplatesApi = {
  list: (params: Params = {}) =>
    apiClient.get<PaginatedResponse<FinancialDocumentTemplate>>(
      `${templatesBase}/${buildQuery(params)}`,
    ),
  get: (id: string) =>
    apiClient.get<FinancialDocumentTemplate>(`${templatesBase}/${id}/`),
  create: (data: TemplateWriteInput) =>
    apiClient.post<FinancialDocumentTemplate>(`${templatesBase}/`, data),
  importXlsx: (file: File, recordType: string, name: string) => {
    const body = new FormData();
    body.append("file", file);
    body.append("record_type", recordType);
    body.append("name", name);
    return apiClient.post<FinancialDocumentTemplate>(
      `${templatesBase}/import-xlsx/`,
      body,
    );
  },
  update: (id: string, data: Partial<TemplateWriteInput>) =>
    apiClient.patch<FinancialDocumentTemplate>(`${templatesBase}/${id}/`, data),
  publish: (id: string, isDefault = true) =>
    apiClient.post<FinancialDocumentTemplate>(
      `${templatesBase}/${id}/publish/`,
      {
        is_default: isDefault,
      },
    ),
  newVersion: (id: string) =>
    apiClient.post<FinancialDocumentTemplate>(
      `${templatesBase}/${id}/new-version/`,
      {},
    ),
  archive: (id: string) =>
    apiClient.post<{ message: string }>(`${templatesBase}/${id}/archive/`, {}),
  restore: (id: string) =>
    apiClient.post<{ message: string }>(`${templatesBase}/${id}/restore/`, {}),
  active: (recordType: string) =>
    apiClient.get<{
      record_type: string;
      template: FinancialDocumentTemplate | null;
    }>(`${templatesBase}/active/${buildQuery({ record_type: recordType })}`),
};
