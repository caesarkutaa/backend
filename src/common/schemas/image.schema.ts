import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class Image {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  publicId: string; // Cloudinary public_id — needed to delete/replace the file
}

export const ImageSchema = SchemaFactory.createForClass(Image);