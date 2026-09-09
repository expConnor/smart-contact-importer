import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { AuthModule } from '../auth/auth.module';
import { ContactsService } from './contacts.service';

@Module({
  imports: [AuthModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [],
})
export class ContactsModule {}
