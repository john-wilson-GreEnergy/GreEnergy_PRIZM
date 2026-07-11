import { Assertion } from './Assertion';
import { Evidence } from './Evidence';
import { Observation } from './Observation';
import type { AssertionRecord, EvidenceRecord, KnowledgeStoreSnapshot, ObservationRecord } from './types';

export class KnowledgeStore {
  private readonly observations = new Map<string, Observation>();
  private readonly evidence = new Map<string, Evidence>();
  private readonly assertions = new Map<string, Assertion>();

  public addObservation(input: ObservationRecord): Observation {
    const observation = new Observation(input);
    this.observations.set(observation.id, observation);
    return observation;
  }

  public addEvidence(input: EvidenceRecord): Evidence {
    const evidence = new Evidence(input);
    this.evidence.set(evidence.id, evidence);
    return evidence;
  }

  public addAssertion(input: AssertionRecord): Assertion {
    const assertion = new Assertion(input);
    this.assertions.set(assertion.id, assertion);
    return assertion;
  }

  public getObservation(id: string): Observation | undefined {
    return this.observations.get(id);
  }

  public getEvidence(id: string): Evidence | undefined {
    return this.evidence.get(id);
  }

  public getAssertion(id: string): Assertion | undefined {
    return this.assertions.get(id);
  }

  public listObservations(): readonly Observation[] {
    return Array.from(this.observations.values());
  }

  public listEvidence(): readonly Evidence[] {
    return Array.from(this.evidence.values());
  }

  public listAssertions(): readonly Assertion[] {
    return Array.from(this.assertions.values());
  }

  public snapshot(): KnowledgeStoreSnapshot<Observation | Evidence | Assertion> {
    return {
      items: [...this.listObservations(), ...this.listEvidence(), ...this.listAssertions()],
    };
  }
}
