import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { type SortParam, sortParams } from '../../common/query/sort';
import { type ContactSortColumn, CONTACT_SORT_COLUMNS } from '../contact.query';
import { Transform } from 'class-transformer';

export class ListContactsQueryDto {
  @IsOptional()
  @IsIn(sortParams(CONTACT_SORT_COLUMNS))
  sort?: SortParam<ContactSortColumn>;

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
