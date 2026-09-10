import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListContactsResponseDto } from './dto/list-contacts-response.dto';
import { toContactResponseDto } from './contact.mapper';
import { ContactListQuery, toNextCursor } from './contact.query';
import { toOrderBy } from '../common/query/sort';
import { toWhere } from '../common/query/filter';
import { toPageAnchor } from '../common/query/cursor';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ContactListQuery): Promise<ListContactsResponseDto> {
    const contacts = await this.prisma.contact.findMany({
      where: toWhere(query.filters),
      orderBy: toOrderBy(query.sort),
      cursor: toPageAnchor(query.cursor),
      take: query.limit + 1,
    });
    const nextRow = contacts.length > query.limit ? contacts.pop() : null;

    const response: ListContactsResponseDto = {
      items: contacts.map(toContactResponseDto),
      nextCursor: nextRow
        ? toNextCursor(nextRow, query.sort, query.filters)
        : null,
    };

    return response;
  }
}
