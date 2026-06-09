import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CheckInsController } from './check-ins.controller';
import { CheckInsService } from './check-ins.service';

@Module({
  imports: [UsersModule],
  controllers: [CheckInsController],
  providers: [CheckInsService],
  exports: [CheckInsService],
})
export class CheckInsModule {}
