'use client';

import { useStore } from '@/store/useStore';
import Sidebar from '@/components/seo/Sidebar';
import Step1ProjectSetup from '@/components/seo/Step1ProjectSetup';
import Step2SiloStructure from '@/components/seo/Step2SiloStructure';
import Step3SemanticGen from '@/components/seo/Step3SemanticGen';
import Step4PageManagement from '@/components/seo/Step4PageManagement';
import Step5ExportSave from '@/components/seo/Step5ExportSave';

export default function Home() {
  const { currentStep } = useStore();

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1ProjectSetup />;
      case 2:
        return <Step2SiloStructure />;
      case 3:
        return <Step3SemanticGen />;
      case 4:
        return <Step4PageManagement />;
      case 5:
        return <Step5ExportSave />;
      default:
        return <Step1ProjectSetup />;
    }
  };

  return (
    <div className="flex h-dvh bg-slate-950 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-6xl mx-auto p-4 md:p-8 pt-16 md:pt-8 pb-20 md:pb-8">
          {renderStep()}
        </div>
      </main>
    </div>
  );
}
