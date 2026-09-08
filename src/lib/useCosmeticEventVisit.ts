import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { useStore } from "../store";
import { supabase, jsonToBadges } from "./supabase";
import { toast } from "./toast";

/** One authenticated request on entry/return to the foreground. The server
 * chooses eligible events and timestamps; hidden tabs do not qualify at boot. */
export function useCosmeticEventVisit() {
  const userId = useStore((s) => s.userId);
  const cloud = useStore((s) => s.cloud);
  useEffect(() => {
    if (!userId || !cloud || !supabase) return;
    const client = supabase;
    let cancelled = false;
    let pending = false;
    const visit = async () => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      try {
        const { data, error } = await client.rpc("record_cosmetic_event_visit");
        if (
          cancelled ||
          useStore.getState().userId !== userId ||
          error ||
          !Array.isArray(data) ||
          !data.length
        )
          return;
        await useStore.getState().fetchShop();
        const badges = await client
          .from("user_badges")
          .select(
            "badge:badges(id,slug,name,description,icon,prestige,kind,effect)",
          )
          .eq("user_id", userId)
          .is("revoked_at", null);
        if (cancelled || useStore.getState().userId !== userId) return;
        if (!badges.error)
          useStore.setState({
            myBadges: jsonToBadges(
              (badges.data ?? []).map((row) => row.badge).flat(),
            ),
          });
        for (const grant of data)
          if (typeof grant.name === "string")
            toast(
              `You earned ${grant.name}! Find it in My Cosmetics.`,
              Sparkles,
            );
      } catch {
        // A failed request can retry on the next foreground visit. The server's
        // qualifying visit and grant are atomic, so partial awards cannot occur.
      } finally {
        pending = false;
      }
    };
    const onVisible = () => {
      void visit();
    };
    onVisible();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, cloud]);
}
