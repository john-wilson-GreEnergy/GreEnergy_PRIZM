export type IssueSeverity='critical'|'alarm'|'warning'|'info'|'unknown';
export interface HvacIssue {
  key:string;code:string;title:string;severity:IssueSeverity;
}
export interface HvacAffectedTarget {
  id:string;label:string;array:number|null;unit:number|null;
  issues:HvacIssue[];severity:IssueSeverity;
}
export interface HvacIssueReview {
  issueTypes?:HvacIssue[];
  devices:HvacAffectedTarget[];
  unassigned:HvacAffectedTarget[];
  partial:boolean;
}
export interface GuidanceGap {
  groupId:string;code:string;title:string;severity:IssueSeverity;
  missing:string[];targetCount:number;
}
