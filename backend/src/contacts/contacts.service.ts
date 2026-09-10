import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListContactsResponseDto } from './dto/list-contacts-response.dto';
import { toContactResponseDto } from './contact.mapper';
import {
  ContactListQuery,
  toNextCursor,
  toOrderBy,
  toPageStart,
  toWhere,
} from './contact.query';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ContactListQuery): Promise<ListContactsResponseDto> {
    console.log('Query:', query);
    // Take one extra row. It is never returned to the client — it only proves a
    // next page exists and seeds nextCursor. Because it is withheld, Prisma's
    // inclusive `cursor` opens the next page exactly on it, so there is no
    // `skip: 1` here.
    const contacts = await this.prisma.contact.findMany({
      take: query.limit + 1,
      orderBy: toOrderBy(query.sort),
      ...toPageStart(query.cursor),
      ...toWhere(query.filters),
    });
    const nextRow = contacts.length > query.limit ? contacts.pop() : null;

    const response: ListContactsResponseDto = {
      items: contacts.map(toContactResponseDto),
      nextCursor: nextRow ? toNextCursor(nextRow, query.sort) : null,
    };

    return response;
  }
}
