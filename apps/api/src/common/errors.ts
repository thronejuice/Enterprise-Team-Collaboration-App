import { HttpException, HttpStatus } from '@nestjs/common';

/** Machine-readable codes the web app maps to messages. Response shape: { statusCode, message, code }. */
export type ErrorCode =
  | 'ACCOUNT_SUSPENDED'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'LAST_ADMIN'
  | 'HANDOVER_INVALID'
  | 'ALREADY_SUSPENDED'
  | 'NOT_SUSPENDED'
  | 'ANONYMIZED'
  | 'CONFIRMATION_MISMATCH'
  | 'IMPORT_EXPIRED'
  | 'IMPORT_INVALID'
  | 'EMPLOYEE_ID_TAKEN'
  | 'EMAIL_TAKEN'
  | 'DEPARTMENT_NAME_TAKEN'
  | 'PASSWORD_UNCHANGED'
  | 'DEVICE_LIMIT'
  | 'PRIVACY_NOTICE_REQUIRED';

export function coded(status: HttpStatus, code: ErrorCode, message: string): HttpException {
  return new HttpException({ statusCode: status, message, code }, status);
}
