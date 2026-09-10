import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { type SortParam, sortParams } from '../../common/query/sort';
import {
  type ContactSortColumn,
  CONTACT_SORT_COLUMNS,
  CONTACT_STATUSES,
  type ContactStatus,
} from '../contact.query';
import { Transform } from 'class-transformer';

export class ListContactsQueryDto {
  @IsOptional()
  @IsIn(sortParams(CONTACT_SORT_COLUMNS))
  sort?: SortParam<ContactSortColumn>;

  @IsOptional()
  @Transform(({ value }) => String(value).toLowerCase())
  @IsIn(CONTACT_STATUSES)
  status?: ContactStatus;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
