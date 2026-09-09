import { ContactResponseDto } from './contact-response.dto';

export class ListContactsResponseDto {
  items!: ContactResponseDto[];
  nextCursor!: string | null;
}
