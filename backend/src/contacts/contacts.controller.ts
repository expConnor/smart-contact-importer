import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContactsService } from './contacts.service';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import { ListContactsResponseDto } from './dto/list-contacts-response.dto';
import { toContactListQuery } from './contact.query';

@UseGuards(JwtAuthGuard)
@Controller({ path: 'contacts', version: '1' })
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  async list(
    @Query() queryDto: ListContactsQueryDto,
  ): Promise<ListContactsResponseDto> {
    return this.contactsService.list(toContactListQuery(queryDto));
  }
}
