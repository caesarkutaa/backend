import { IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/utils/transformers';

/** Empty text removes the reply */
export class ReplyReviewDto {
  @Trim()
  @IsString()
  @MaxLength(1000)
  text: string;
}