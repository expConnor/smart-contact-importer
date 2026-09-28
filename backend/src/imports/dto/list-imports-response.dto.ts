import type { ImportJobStatus } from '../../generated/prisma/enums';

export class ImportSummaryDto {
  id!: string;
  status!: ImportJobStatus;
  originalFilename!: string;
}

export class ListImportsResponseDto {
  items!: ImportSummaryDto[];
}
