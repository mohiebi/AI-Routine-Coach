import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProgressService } from './progress.service';

@ApiTags('progress')
@Controller('users/:userId/progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get()
  dashboard(@Param('userId') userId: string) {
    return this.progressService.dashboard(userId);
  }
}
