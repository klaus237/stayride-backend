import { Module } from '@nestjs/common';
import { StorageService } from './cloudinary.service';

@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
