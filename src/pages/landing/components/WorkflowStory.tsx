import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { ProductScreenshot, type LandingShot } from "./ProductScreenshot";

export type WorkflowStep = {
  title: string;
  description: string;
  shot: LandingShot;
};

export function WorkflowStory({ steps }: { steps: readonly WorkflowStep[] }) {
  const list = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { scrollYProgress } = useScroll({
    target: list,
    offset: ["start center", "end center"],
  });

  const updateActive = (progress: number) => {
    setActive(Math.min(steps.length - 1, Math.floor(progress * steps.length)));
  };

  useMotionValueEvent(scrollYProgress, "change", (progress) => {
    if (!reduce && !dialogOpen) updateActive(progress);
  });

  const step = steps[active];

  return (
    <section id="workflow" className="route-workflow" aria-labelledby="workflow-title">
      <div className="route-wrap">
        <Reveal><h2 id="workflow-title">От данных к действию</h2></Reveal>
        <div className="route-story">
          <ol ref={list} className="route-story-steps">
            {steps.map(({ title, description, shot }, index) => (
              <li key={title} className="route-story-step" data-active={active === index}>
                <div className="route-story-step-copy">
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <figure className="route-story-inline">
                  <ProductScreenshot shot={shot} />
                  <figcaption>{shot.title} · тестовые данные</figcaption>
                </figure>
              </li>
            ))}
          </ol>
          <figure className="route-story-stage">
            <div className="route-story-screen">
              <ProductScreenshot
                shot={step.shot}
                onDialogChange={(open) => {
                  setDialogOpen(open);
                  if (!open) updateActive(scrollYProgress.get());
                }}
              />
            </div>
            <figcaption className="route-story-caption">
              <span>{step.shot.title} · тестовые данные</span>
              <span>{active + 1} из {steps.length}</span>
            </figcaption>
            <div className="route-story-progress" aria-hidden="true">
              <motion.div style={{ scaleX: scrollYProgress }} />
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
