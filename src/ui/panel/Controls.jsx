import { EffectSection, ImageSection } from './EffectImage.jsx';
import CutoutSection from './CutoutSection.jsx';
import GradientSection from './GradientSection.jsx';
import HalftoneSection from './HalftoneSection.jsx';
import { TypographySection, CharsSection, TonesSection } from './CharsSections.jsx';
import ColorsSection from './ColorsSection.jsx';
import { ScreenFxSection, OutputSection } from './FxOutputSections.jsx';
import './Controls.css';

// Colonne de réglages, dans l'ordre de la référence
export default function Controls() {
  return (
    <aside className="controls" aria-label="Réglages">
      <EffectSection />
      <ImageSection />
      <CutoutSection />
      <GradientSection />
      <HalftoneSection />
      <TypographySection />
      <CharsSection />
      <TonesSection />
      <ColorsSection />
      <ScreenFxSection />
      <OutputSection />
    </aside>
  );
}
