// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChats } from "../../chats";
import { Composer } from "../../components/Composer";
import { PageHeader } from "../../components/PageHeader";
import { newChatSuggestions, type Scope } from "../../fixtures";
import { SuggestionRow } from "./ChatThread";

const CONTINUE_CHAT_ID = "revenue-performance-dashboard";

const TOPICAL_CHANCE = 0.2;

function timeOfDayGreeting(hour: number): string {
   if (hour < 5) return "Good evening!";
   if (hour < 12) return "Good morning!";
   if (hour < 17) return "Good afternoon!";
   return "Good evening!";
}

function topicalGreetings(now: Date): string[] {
   const hour = now.getHours();
   const day = now.getDay();
   const month = now.getMonth();
   const date = now.getDate();
   const options: string[] = [];

   if (month === 0 && date === 1) options.push("Happy New Year!");
   if (month === 9 && date === 31) options.push("Happy Halloween!");
   if (month === 11 && date >= 24 && date <= 26)
      options.push("Happy holidays!");
   if (hour < 5) options.push("Burning the midnight oil?");
   if (hour >= 5 && hour < 7) options.push("Up early, huh?");
   if (day === 1 && hour < 12) options.push("Happy Monday!");
   if (day === 5) options.push("Happy Friday!");
   if (day === 0 || day === 6) options.push("Working the weekend?");
   if (hour >= 12 && hour < 14) options.push("Lunchtime question?");

   return options;
}

function pickGreeting(now = new Date()): string {
   const topical = topicalGreetings(now);
   if (topical.length > 0 && Math.random() < TOPICAL_CHANCE) {
      return topical[Math.floor(Math.random() * topical.length)];
   }
   return timeOfDayGreeting(now.getHours());
}

export function NewChat() {
   const { send } = useChats();
   const navigate = useNavigate();
   const [scope, setScope] = useState<Scope>({});
   const [greeting] = useState(() => pickGreeting());

   const ask = (text: string) => navigate(`/chats/${send(null, text, scope)}`);

   return (
      <>
         <PageHeader title="New chat" muted />
         <div className="flex flex-1 items-center justify-center px-4 pb-24">
            <div className="w-full max-w-[480px]">
               <h2 className="text-[20px] font-semibold tracking-tight">
                  {greeting}
               </h2>
               <p className="mt-1 mb-4 text-[11px] text-muted">
                  Ask across every package, or pick one to narrow the scope.
               </p>
               <Composer
                  hero
                  modelPicker
                  autoFocus
                  scope={scope}
                  onScopeChange={setScope}
                  onSubmit={ask}
               />
               <div className="mt-2">
                  <SuggestionRow
                     items={[
                        ...newChatSuggestions.map((s) => ({
                           label: s,
                           onClick: () => ask(s),
                        })),
                        {
                           label: "Continue: Revenue performance",
                           onClick: () =>
                              navigate(`/chats/${CONTINUE_CHAT_ID}`),
                        },
                     ]}
                  />
               </div>
            </div>
         </div>
      </>
   );
}
