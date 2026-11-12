import { IsHexadecimal, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsHexadecimal({ message: 'Invalid reset link' })
  @Length(64, 64, { message: 'Invalid reset link' })
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password must contain at least one letter and one number',
  })
  password: string;
}