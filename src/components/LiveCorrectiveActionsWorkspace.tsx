import React from 'react';
import {useSiteDataFields} from '../context/SiteDataContext';
import {CorrectiveActionsWorkspace} from './CorrectiveActionsWorkspace';
import {correctiveReviewPresentation} from '../lib/operationsReview';

/** Subscribe to the existing central polling lane, never start an additional collector. */
export default function LiveCorrectiveActionsWorkspace({onEditGuidance}:{onEditGuidance?:(id:string|null)=>void}){
  const state=useSiteDataFields([
    'snapshot','error','dataQualityWarning','isInitialLoading','isPollingEnabled','isTerminated',
  ]);
  return <CorrectiveActionsWorkspace {...correctiveReviewPresentation(state)} onEditGuidance={onEditGuidance}/>;
}
