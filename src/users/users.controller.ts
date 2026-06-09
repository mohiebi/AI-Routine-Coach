import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RegisterTelegramUserDto } from './dto/register-telegram-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('telegram')
  registerTelegramUser(@Body() dto: RegisterTelegramUserDto) {
    return this.usersService.registerTelegramUser(dto);
  }

  @Get(':userId')
  findById(@Param('userId') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch(':userId/preferences')
  updatePreferences(
    @Param('userId') userId: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.usersService.updatePreferences(userId, dto);
  }
}
