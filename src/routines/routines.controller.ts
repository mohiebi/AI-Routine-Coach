import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateRoutineDto } from './dto/create-routine.dto';
import { UpdateRoutineDto } from './dto/update-routine.dto';
import { RoutinesService } from './routines.service';

@ApiTags('routines')
@Controller('users/:userId/routines')
export class RoutinesController {
  constructor(private readonly routinesService: RoutinesService) {}

  @Post()
  create(@Param('userId') userId: string, @Body() dto: CreateRoutineDto) {
    return this.routinesService.create(userId, dto);
  }

  @Get()
  list(
    @Param('userId') userId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.routinesService.list(userId, includeInactive === 'true');
  }

  @Get(':routineId')
  find(@Param('userId') userId: string, @Param('routineId') routineId: string) {
    return this.routinesService.find(userId, routineId);
  }

  @Patch(':routineId')
  update(
    @Param('userId') userId: string,
    @Param('routineId') routineId: string,
    @Body() dto: UpdateRoutineDto,
  ) {
    return this.routinesService.update(userId, routineId, dto);
  }

  @Delete(':routineId')
  archive(
    @Param('userId') userId: string,
    @Param('routineId') routineId: string,
  ) {
    return this.routinesService.archive(userId, routineId);
  }
}
