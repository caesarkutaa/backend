import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BankAccount, BankAccountDocument } from './schemas/bank-account.schema';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { compact, isObjectId } from '../common/utils/object.util';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(BankAccount.name)
    private readonly bankAccountModel: Model<BankAccount>,
  ) {}

  /* ---------- Public ---------- */
  findActiveAccounts(): Promise<BankAccountDocument[]> {
    return this.bankAccountModel
      .find({ isActive: true })
      .select('bankName accountName accountNumber note')
      .sort({ createdAt: 1 })
      .exec();
  }

  /** Used when the customer says which account they paid into */
  async findActiveById(id: string): Promise<BankAccountDocument> {
    if (!isObjectId(id)) {
      throw new BadRequestException('Please select the account you paid into');
    }
    const account = await this.bankAccountModel.findOne({ _id: id, isActive: true }).exec();
    if (!account) {
      throw new BadRequestException(
        'The selected bank account is no longer available. Please choose another.',
      );
    }
    return account;
  }

  /* ---------- Admin ---------- */
  findAllAdmin(): Promise<BankAccountDocument[]> {
    return this.bankAccountModel.find().sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<BankAccountDocument> {
    if (!isObjectId(id)) throw new NotFoundException('Bank account not found');
    const account = await this.bankAccountModel.findById(id).exec();
    if (!account) throw new NotFoundException('Bank account not found');
    return account;
  }

  async create(dto: CreateBankAccountDto): Promise<BankAccountDocument> {
    await this.ensureUnique(dto.bankName, dto.accountNumber);
    return this.bankAccountModel.create(compact(dto));
  }

  async update(id: string, dto: UpdateBankAccountDto): Promise<BankAccountDocument> {
    const account = await this.findById(id);
    const updates = compact(dto);

    const bankName = updates.bankName ?? account.bankName;
    const accountNumber = updates.accountNumber ?? account.accountNumber;
    if (bankName !== account.bankName || accountNumber !== account.accountNumber) {
      await this.ensureUnique(bankName, accountNumber, id);
    }

    account.set(updates);
    return account.save();
  }

  async remove(id: string) {
    const account = await this.findById(id);
    await account.deleteOne(); // past orders keep their own snapshot of the account
    return { message: 'Bank account deleted successfully' };
  }

  private async ensureUnique(bankName: string, accountNumber: string, excludeId?: string) {
    const existing = await this.bankAccountModel
      .findOne({
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
      .collation({ locale: 'en', strength: 2 })
      .exec();

    if (existing) {
      throw new ConflictException('This bank account has already been added');
    }
  }
}