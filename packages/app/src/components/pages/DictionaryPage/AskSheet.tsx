// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from "react";
import type { Entity, Ontology } from "../../../ontology/types";
import { AskButton } from "../../chat/AskButton";
import type { AskContext } from "../../chat/askWindowStore";
import { pageMarkdown } from "./pageContext";
import { displayName } from "./shared";

/** Opens the floating Ask window on this page, and keeps it reading the page while open. */
export function AskSheet({
   ontology,
   entity,
   draftDoc,
}: {
   ontology: Ontology;
   entity?: Entity;
   draftDoc?: string;
}) {
   const context = useMemo<AskContext>(
      () => ({
         scope: {
            environment: ontology.environmentName,
            package: ontology.packageName,
         },
         page: pageMarkdown(ontology, entity, draftDoc),
         subject: entity ? displayName(entity) : ontology.packageName,
         suggestions: suggestions(entity),
      }),
      [ontology, entity, draftDoc],
   );
   return <AskButton context={context} />;
}

function suggestions(entity?: Entity): string[] {
   switch (entity?.kind) {
      case "measure":
         return [
            "How is this calculated, in plain words?",
            "What drove the biggest change in this over the last year?",
            "Which dimensions is it most often broken down by?",
         ];
      case "dimension":
         return [
            "What does each value mean?",
            "Which measures are most interesting broken down by this?",
         ];
      case "source":
         return [
            "What does one row mean, and what can I answer with this source?",
            "Are there fan-out risks in its joins?",
         ];
      case "view":
         return [
            "What question does this view answer?",
            "Summarize what it shows right now",
         ];
      default:
         return [
            "What can I answer with this package?",
            "Which measures matter most here?",
         ];
   }
}
