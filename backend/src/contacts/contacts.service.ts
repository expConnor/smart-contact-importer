import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListContactsResponseDto } from './dto/list-contacts-response.dto';
import { toContactResponseDto } from './contact.mapper';
import { ContactListQuery, toNextCursor, toOrderBy } from './contact.query';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ContactListQuery): Promise<ListContactsResponseDto> {
    const contacts = await this.prisma.contact.findMany({
      take: query.limit + 1,
      orderBy: toOrderBy(query.sort),
    });

    const nextRow = contacts.length > query.limit ? contacts.pop() : null;

    const response: ListContactsResponseDto = {
      items: contacts.map(toContactResponseDto),
      nextCursor: nextRow ? toNextCursor(nextRow, query.sort) : null,
    };

    return response;
  }
}
