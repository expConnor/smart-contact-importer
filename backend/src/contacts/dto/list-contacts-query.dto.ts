import { IsIn, IsOptional } from 'class-validator';
import { type SortParam, sortParams } from '../../common/query/sort';
import { type ContactSortColumn, CONTACT_SORT_COLUMNS } from '../contact.query';

export class ListContactsQueryDto {
  @IsOptional()
  @IsIn(sortParams(CONTACT_SORT_COLUMNS))
  sort?: SortParam<ContactSortColumn>;
}
