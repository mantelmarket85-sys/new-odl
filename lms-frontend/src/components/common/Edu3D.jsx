import React from "react";

/**
 * Lightweight CSS-driven 3D educational visuals.
 * No external libraries (no Three.js) so they stay fast on every device.
 * All decorative — pointer-events: none so they never block the underlying UI.
 *
 * The styling for each primitive (.edu-3d-book, .edu-3d-cap, .edu-3d-sphere,
 * .edu-3d-atom, .edu-halo, .edu-float, .edu-3d-stage) lives in src/index.css.
 */

export const Edu3DBook = ({ variant = "", className = "", style }) => (
  <div className={`edu-3d-book ${variant} ${className}`} style={style} aria-hidden="true">
    <span className="cover" />
    <span className="pages" />
  </div>
);

export const Edu3DCap = ({ className = "", style }) => (
  <div className={`edu-3d-cap ${className}`} style={style} aria-hidden="true">
    <span className="board" />
    <span className="base" />
    <span className="tassel" />
  </div>
);

export const Edu3DSphere = ({ variant = "", className = "", style }) => (
  <div className={`edu-3d-sphere ${variant} ${className}`} style={style} aria-hidden="true" />
);

export const Edu3DAtom = ({ className = "", style }) => (
  <div className={`edu-3d-atom ${className}`} style={style} aria-hidden="true">
    <span className="nucleus" />
  </div>
);

export const Edu3DHalo = ({ className = "", style }) => (
  <div className={`edu-halo ${className}`} style={style} aria-hidden="true" />
);

/**
 * Edu3DCharacter — animated 3D educational character holding an open book.
 * Pure CSS / SVG, no external libraries. Decorative only.
 * Tone variants: "violet" (default), "emerald", "amber", "cyan".
 */
export const Edu3DCharacter = ({ tone = "violet", className = "", style }) => (
  <div className={`edu-3d-character edu-3d-character--${tone} ${className}`} style={style} aria-hidden="true">
    <div className="edu-char-halo" />
    <div className="edu-char-body">
      <div className="edu-char-head">
        <div className="edu-char-cap">
          <span className="cap-board" />
          <span className="cap-base" />
          <span className="cap-tassel" />
        </div>
        <div className="edu-char-face">
          <span className="eye left" />
          <span className="eye right" />
          <span className="smile" />
        </div>
      </div>
      <div className="edu-char-torso">
        <span className="collar" />
        <span className="tie" />
      </div>
      <div className="edu-char-arm left" />
      <div className="edu-char-arm right" />
      <div className="edu-char-book">
        <span className="book-spine" />
        <span className="book-page left" />
        <span className="book-page right" />
        <span className="book-line l1" />
        <span className="book-line l2" />
        <span className="book-line l3" />
        <span className="book-sparkle" />
      </div>
    </div>
  </div>
);

/**
 * Edu3DScene — a small composed decorative scene placed absolutely inside
 * a hero/banner. Parent must be `position: relative; overflow: hidden;`.
 *
 * Variants:
 *  - "coordinator" : books + graduation cap + sphere  (admin / Course Coordinator)
 *  - "teacher"     : atom + book + sphere
 *  - "student"     : graduation cap + book + atom
 *  - "compact"     : single small cluster for tight cards
 */
export const Edu3DScene = ({ variant = "coordinator", className = "" }) => {
  // shared wrapper styling — hovers above hero content but never blocks it
  const stageStyle = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    overflow: "hidden",
  };

  if (variant === "compact") {
    return (
      <div className={`edu-3d-stage ${className}`} aria-hidden="true" style={stageStyle}>
        <Edu3DHalo style={{ top: "-30px", right: "-30px", width: "160px", height: "160px", position: "absolute" }} />
        <Edu3DBook className="edu-float" style={{ position: "absolute", top: "12%", right: "12%" }} />
        <Edu3DSphere
          variant="violet"
          className="edu-float-x"
          style={{ position: "absolute", bottom: "14%", right: "30%", width: "28px", height: "28px" }}
        />
      </div>
    );
  }

  if (variant === "teacher") {
    return (
      <div className={`edu-3d-stage ${className}`} aria-hidden="true" style={stageStyle}>
        <Edu3DHalo style={{ top: "-60px", right: "-40px", width: "260px", height: "260px", position: "absolute" }} />
        <Edu3DCharacter tone="cyan" style={{ position: "absolute", bottom: "8%", right: "8%" }} />
        <Edu3DAtom className="edu-float" style={{ position: "absolute", top: "10%", right: "8%" }} />
        <Edu3DBook variant="alt" className="edu-float-x" style={{ position: "absolute", bottom: "18%", right: "26%" }} />
        <Edu3DSphere
          variant="cyan"
          className="edu-float"
          style={{ position: "absolute", top: "55%", right: "6%", width: "34px", height: "34px" }}
        />
        <Edu3DSphere
          variant="amber"
          className="edu-float-x"
          style={{ position: "absolute", top: "22%", right: "40%", width: "22px", height: "22px" }}
        />
      </div>
    );
  }

  if (variant === "student") {
    return (
      <div className={`edu-3d-stage ${className}`} aria-hidden="true" style={stageStyle}>
        <Edu3DHalo style={{ top: "-50px", right: "-40px", width: "240px", height: "240px", position: "absolute" }} />
        <Edu3DCharacter tone="emerald" style={{ position: "absolute", bottom: "6%", right: "10%" }} />
        <Edu3DCap className="edu-float" style={{ position: "absolute", top: "12%", right: "10%" }} />
        <Edu3DBook variant="green" className="edu-float-x" style={{ position: "absolute", bottom: "18%", right: "28%" }} />
        <Edu3DAtom className="edu-float" style={{ position: "absolute", top: "50%", right: "4%", transform: "scale(0.75)" }} />
        <Edu3DSphere
          variant="emerald"
          className="edu-float-x"
          style={{ position: "absolute", top: "24%", right: "42%", width: "24px", height: "24px" }}
        />
      </div>
    );
  }

  // default: coordinator
  return (
    <div className={`edu-3d-stage ${className}`} aria-hidden="true" style={stageStyle}>
      <Edu3DHalo style={{ top: "-60px", right: "-50px", width: "280px", height: "280px", position: "absolute" }} />
      <Edu3DCharacter tone="violet" style={{ position: "absolute", bottom: "6%", right: "8%" }} />
      <Edu3DCap className="edu-float" style={{ position: "absolute", top: "10%", right: "8%" }} />
      <Edu3DBook variant="violet" className="edu-float-x" style={{ position: "absolute", top: "46%", right: "4%" }} />
      <Edu3DBook variant="amber" className="edu-float" style={{ position: "absolute", bottom: "14%", right: "22%" }} />
      <Edu3DSphere
        variant="violet"
        className="edu-float-x"
        style={{ position: "absolute", top: "20%", right: "34%", width: "26px", height: "26px" }}
      />
      <Edu3DSphere
        variant="cyan"
        className="edu-float"
        style={{ position: "absolute", bottom: "32%", right: "38%", width: "20px", height: "20px" }}
      />
    </div>
  );
};

export default Edu3DScene;
