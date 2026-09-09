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

  // Nest has already validated the query string into the DTO by the time this runs;
  // toContactListQuery turns that into a domain query — defaults applied, cursor
  // decoded and checked. The controller decides nothing itself.
  @Get()
  async list(
    @Query() queryDto: ListContactsQueryDto,
  ): Promise<ListContactsResponseDto> {
    return this.contactsService.list(toContactListQuery(queryDto));
  }
}
