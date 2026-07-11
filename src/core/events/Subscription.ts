export class Subscription {
  public readonly id: string;
  public readonly type: string;
  private removed = false;

  public constructor(id: string, type: string) {
    this.id = id;
    this.type = type;
  }

  public unsubscribe(): boolean {
    if (this.removed) {
      return false;
    }

    this.removed = true;
    return true;
  }

  public isRemoved(): boolean {
    return this.removed;
  }
}
