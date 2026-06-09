import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CheckInsService } from './check-ins.service';
import { CreateDailyCheckInDto } from './dto/create-daily-check-in.dto';

@ApiTags('check-ins')
@Controller('users/:userId/check-ins')
export class CheckInsController {
  constructor(private readonly checkInsService: CheckInsService) {}

  @Post('today')
  saveToday(
    @Param('userId') userId: string,
    @Body() dto: CreateDailyCheckInDto,
  ) {
    return this.checkInsService.saveToday(userId, dto);
  }
}
