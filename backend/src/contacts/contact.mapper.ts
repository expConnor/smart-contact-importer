import { Contact } from '../generated/prisma/client';
import { ContactResponseDto } from './dto/contact-response.dto';

export function toContactResponseDto(row: Contact): ContactResponseDto {
  const dto: ContactResponseDto = {
    id: row.id,
    email: row.email,
    name: row.name,
    company: row.company,
    jobTitle: row.jobTitle,
    phone: row.phone,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return dto;
}
