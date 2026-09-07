import { redirect } from "next/navigation";
import { StaggerList, StaggerItem } from "@/components/ui/stagger-list";
import { Reveal } from "@/components/ui/reveal";

export default function PersonnelIndexPage() {
  redirect("/personnel/personnel");
}
