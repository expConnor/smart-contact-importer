import { Injectable } from '@nestjs/common';
import { CreateImportResponseDto } from './dto/create-import-response.dto';

@Injectable()
export class ImportsService {
  // Step 6 stub. Real body: hash the file, insert the ImportJob, arbitrate the
  // P2002 into replay-or-409. Kept non-async so `require-await` stays quiet.
  create(): Promise<CreateImportResponseDto> {
    return Promise.resolve({ id: 'uuidofthefile123' });
  }
}
