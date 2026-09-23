import { Link } from "react-router-dom";
import logoUrl from "../../assets/aust-logo.png";

/**
 * AUST ODL — Official University Logo
 * Uses the real Abbottabad University of Science & Technology emblem
 * (replaces the previous emoji/icon placeholder).
 */
const Logo = ({ size = "md", showText = true, light = false, to = "/" }) => {
  const sizes = {
    sm: { img: "h-9 w-9", text: "text-base", sub: "text-[9px]" },
    md: { img: "h-11 w-11", text: "text-lg", sub: "text-[10px]" },
    lg: { img: "h-16 w-16", text: "text-2xl", sub: "text-[11px]" },
  };
  return (
    <Link to={to} className="flex items-center gap-3 group">
      <div className="relative shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/30 via-indigo-500/20 to-cyan-400/30 rounded-full blur-md opacity-70 group-hover:opacity-100 transition" />
        <img
          src={logoUrl}
          alt="Abbottabad University of Science & Technology"
          className={`relative ${sizes[size].img} object-contain drop-shadow-md`}
          draggable={false}
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-tight min-w-0">
          <span className={`font-display font-extrabold ${sizes[size].text} ${light ? "text-white" : "text-app"} truncate`}>
            AUST<span className="gradient-text"> ODL</span>
          </span>
          <span className={`${sizes[size].sub} tracking-[0.18em] font-bold uppercase ${light ? "text-blue-100" : "text-slate-500 dark:text-slate-400"} truncate`}>
            Abbottabad · Pakistan
          </span>
        </div>
      )}
    </Link>
  );
};

export default Logo;
