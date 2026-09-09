import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListContactsResponseDto } from './dto/list-contacts-response.dto';
import { toContactResponseDto } from './contact.mapper';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ListContactsResponseDto> {
    const contacts = await this.prisma.contact.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const response: ListContactsResponseDto = {
      items: contacts.map(toContactResponseDto),
      nextCursor: null,
    };

    return response;
  }
}
