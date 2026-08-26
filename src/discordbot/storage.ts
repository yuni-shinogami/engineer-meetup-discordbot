import fs from 'fs';
import path from 'path';
import { config } from './config';

interface StorageData {
  isScheduled: boolean;
  lastTweetId: string | null;
  preAnnouncePostUrl: string | null;
  lastInviteUrl: string | null;
}

const defaultData: StorageData = {
  isScheduled: false,
  lastTweetId: null,
  preAnnouncePostUrl: null,
  lastInviteUrl: null,
};

export class Storage {
  private data: StorageData;

  constructor() {
    this.data = this.load();
  }

  private load(): StorageData {
    if (fs.existsSync(config.storagePath)) {
      try {
        const content = fs.readFileSync(config.storagePath, 'utf-8');
        return { ...defaultData, ...JSON.parse(content) };
      } catch (e) {
        console.error('Failed to load storage:', e);
      }
    }
    return { ...defaultData };
  }

  private save(): void {
    // 既定の保存先が state/ 配下なので、初回起動時にディレクトリが無いことがある
    const dir = path.dirname(config.storagePath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(config.storagePath, JSON.stringify(this.data, null, 2));
  }

  get isScheduled(): boolean {
    return this.data.isScheduled;
  }

  set isScheduled(value: boolean) {
    this.data.isScheduled = value;
    this.save();
  }

  get lastTweetId(): string | null {
    return this.data.lastTweetId;
  }

  set lastTweetId(value: string | null) {
    this.data.lastTweetId = value;
    this.save();
  }

  get preAnnouncePostUrl(): string | null {
    return this.data.preAnnouncePostUrl;
  }

  set preAnnouncePostUrl(value: string | null) {
    this.data.preAnnouncePostUrl = value;
    this.save();
  }

  get lastInviteUrl(): string | null {
    return this.data.lastInviteUrl;
  }

  set lastInviteUrl(value: string | null) {
    this.data.lastInviteUrl = value;
    this.save();
  }
}

export const storage = new Storage();
