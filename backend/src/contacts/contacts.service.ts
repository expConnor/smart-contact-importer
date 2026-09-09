import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListContactsResponseDto } from './dto/list-contacts-response.dto';
import { toContactResponseDto } from './contact.mapper';
import { ContactListQuery, toOrderBy } from './contact.query';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ContactListQuery): Promise<ListContactsResponseDto> {
    const contacts = await this.prisma.contact.findMany({
      orderBy: toOrderBy(query.sort),
    });

    const response: ListContactsResponseDto = {
      items: contacts.map(toContactResponseDto),
      nextCursor: null,
    };

    return response;
  }
}
