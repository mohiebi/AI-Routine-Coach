import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@Controller('users/:userId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('today')
  today(@Param('userId') userId: string) {
    return this.tasksService.today(userId);
  }

  @Patch(':taskId/status')
  mark(
    @Param('userId') userId: string,
    @Param('taskId') taskId: string,
    @Body() dto: CompleteTaskDto,
  ) {
    return this.tasksService.mark(userId, taskId, dto);
  }
}
