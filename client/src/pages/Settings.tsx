import React, { useState, useEffect, useRef } from 'react';
import { useCompany } from '../context/CompanyContext';
import { Upload, Save, AlertCircle, Plus, Trash2, Edit, X, Image as ImageIcon } from 'lucide-react';
import { Company } from '../types';

const Settings: React.FC = () => {
  const {
    companies,
    selectedCompany,
    setSelectedCompany,
    updateCompany,
    createCompany,
    deleteCompany
  } = useCompany();

  const [formData, setFormData] = useState<Partial<Company>>({});
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [isButtonHovered, setIsButtonHovered] = useState(false);

  // Logo drag-and-drop state
  const [logoDragOver, setLogoDragOver] = useState(false);
  const [logoError, setLogoError] = useState<string>('');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const logoDragCounter = useRef(0);


  useEffect(() => {
    if (selectedCompany) {
      setFormData({
        name: selectedCompany.name || '',
        address: selectedCompany.address || '',
        tpin: selectedCompany.tpin || '',
        bank_details: selectedCompany.bank_details || '',
        vat_rate: selectedCompany.vat_rate || 0.165,
        ppda_rate: selectedCompany.ppda_rate || 0.01,
        primary_color: selectedCompany.primary_color || '#000000',
        secondary_color: selectedCompany.secondary_color || '#ffffff',
        template: selectedCompany.template || 'classic',
        default_terms_conditions: selectedCompany.default_terms_conditions || ''
      });
      if (selectedCompany.logo_url) {
        setLogoPreview(selectedCompany.logo_url);
      } else {
        setLogoPreview(null);
      }
    } else {
      setFormData({});
      setLogoPreview(null);
    }
  }, [selectedCompany]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name.includes('rate') ? parseFloat(value) : value
    }));
  };

  // Shared logo validation + preview pipeline used by both the file picker
  // and the drop zone. Server limit is 5 MB and PNG/JPG only (see multer in
  // routes/companies.js) — we validate the same here so the user sees the
  // error immediately instead of after upload.
  const acceptLogoFile = (file: File): boolean => {
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      setLogoError('Only PNG or JPG images are allowed.');
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError('Image is too large (5 MB maximum).');
      return false;
    }
    setLogoError('');
    setLogo(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    return true;
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) acceptLogoFile(file);
  };

  const handleLogoDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types?.includes('Files')) {
      logoDragCounter.current += 1;
      setLogoDragOver(true);
    }
  };
  const handleLogoDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleLogoDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    logoDragCounter.current = Math.max(0, logoDragCounter.current - 1);
    if (logoDragCounter.current === 0) setLogoDragOver(false);
  };
  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    logoDragCounter.current = 0;
    setLogoDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) acceptLogoFile(file);
  };

  // Prevent the browser from opening the file if the user misses the drop zone.
  useEffect(() => {
    const block = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    setLoading(true);
    setMessage(null);

    try {
      await updateCompany(selectedCompany.id, formData, logo || undefined);
      setMessage({ type: 'success', text: 'Company settings updated successfully!' });
      setLogo(null);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update company settings. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) {
      setMessage({ type: 'error', text: 'Company name cannot be empty.' });
      return;
    }
    setLoading(true);
    try {
      await createCompany(newCompanyName);
      setNewCompanyName('');
      setCreateModalOpen(false);
      setMessage({ type: 'success', text: 'Company created successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to create company.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!companyToDelete) return;
    setLoading(true);
    try {
      await deleteCompany(companyToDelete.id);
      setCompanyToDelete(null);
      setDeleteModalOpen(false);
      setMessage({ type: 'success', text: 'Company deleted successfully!' });
      // If the deleted company was the selected one, the context will handle switching.
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete company.' });
    } finally {
      setLoading(false);
    }
  };

  const primaryColor = formData.primary_color || selectedCompany?.primary_color || '#4f46e5';
  const secondaryColor = formData.secondary_color || selectedCompany?.secondary_color || '#ffffff';

  // Helper to darken a hex color for hover states
  const darkenColor = (hex: string, percent: number = 15): string => {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - Math.round(2.55 * percent));
    const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(2.55 * percent));
    const b = Math.max(0, (num & 0x0000FF) - Math.round(2.55 * percent));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };

  const getButtonStyle = (): React.CSSProperties => {
    if (!selectedCompany) return { backgroundColor: '#4f46e5' };
    return {
      backgroundColor: primaryColor,
    };
  };

  const getButtonHoverStyle = (): React.CSSProperties => {
    if (!selectedCompany) return { backgroundColor: '#4338ca' };
    return {
      backgroundColor: darkenColor(primaryColor),
    };
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">
          Manage your companies and their settings.
        </p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-center space-x-2 ${
          message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          <AlertCircle className="h-5 w-5" />
          <span>{message.text}</span>
        </div>
      )}

      {/* Company Management Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Manage Companies</h2>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Company
          </button>
        </div>
        <ul className="space-y-2">
          {companies.map(company => (
            <li key={company.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
              <span className={`font-medium ${selectedCompany?.id === company.id ? 'text-indigo-600' : 'text-gray-800'}`}>{company.name}</span>
              <div className="space-x-2">
                <button
                  onClick={() => setSelectedCompany(company)}
                  className="p-1 text-gray-500 hover:text-indigo-600"
                  title="Edit"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setCompanyToDelete(company); setDeleteModalOpen(true); }}
                  className="p-1 text-gray-500 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Edit Company Form */}
      {selectedCompany ? (
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-6">Edit Settings for "{selectedCompany.name}"</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Company Name</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500`} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">TPIN</label>
                <input type="text" name="tpin" value={formData.tpin || ''} onChange={handleInputChange} className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500`} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                <textarea name="address" value={formData.address || ''} onChange={handleInputChange} rows={3} className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500`} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Bank Details</label>
                <textarea name="bank_details" value={formData.bank_details || ''} onChange={handleInputChange} rows={3} className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500`} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-2">Default Terms &amp; Conditions</h2>
            <p className="text-sm text-gray-500 mb-4">
              These terms are auto-attached to every new quotation for this company. They appear at
              the bottom of the printable document and can be left empty.
            </p>
            <textarea
              name="default_terms_conditions"
              value={formData.default_terms_conditions || ''}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, default_terms_conditions: e.target.value }))
              }
              rows={6}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder={'Payment due within 30 days of invoice date.\nAll prices are inclusive of VAT.\nGoods remain property of the seller until full payment is received.'}
            />
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-2">Quotation Design</h2>
            <p className="text-sm text-gray-500 mb-6">
              Choose the layout used for this company's quotations and PDFs. Your brand colors and logo
              are applied to whichever design you pick.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  id: 'classic',
                  name: 'Classic',
                  desc: 'Corporate header band, bordered table and a boxed totals panel.',
                },
                {
                  id: 'modern',
                  name: 'Modern',
                  desc: 'Bold colored banner, clean borderless rows and a rounded totals card.',
                },
                {
                  id: 'elegant',
                  name: 'Elegant',
                  desc: 'Centered serif letterhead with a full-width grand-total bar.',
                },
                {
                  id: 'bold',
                  name: 'Bold',
                  desc: 'Split header with massive title, dark totals stack and accented item rows.',
                },
              ].map((tpl) => {
                const selected = (formData.template || 'classic') === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, template: tpl.id as Company['template'] }))}
                    className={`text-left rounded-lg border-2 p-4 transition-all ${
                      selected ? 'shadow-sm' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={selected ? { borderColor: primaryColor, backgroundColor: `${primaryColor}0d` } : {}}
                  >
                    {/* Mini layout sketch */}
                    <div className="rounded-md border border-gray-200 overflow-hidden mb-3 bg-white">
                      {tpl.id === 'classic' && (
                        <div>
                          <div className="h-5 flex items-center justify-between px-1.5" style={{ backgroundColor: `${primaryColor}22` }}>
                            <div className="h-2 w-6 rounded-sm" style={{ backgroundColor: primaryColor }} />
                            <div className="h-1.5 w-8 rounded-sm bg-gray-300" />
                          </div>
                          <div className="h-1" style={{ backgroundColor: primaryColor }} />
                          <div className="p-1.5 space-y-1">
                            <div className="h-2 w-full rounded-sm" style={{ backgroundColor: primaryColor }} />
                            <div className="h-1 w-full bg-gray-200 rounded-sm" />
                            <div className="h-1 w-full bg-gray-200 rounded-sm" />
                          </div>
                        </div>
                      )}
                      {tpl.id === 'modern' && (
                        <div>
                          <div className="h-7 flex items-center justify-between px-1.5" style={{ backgroundColor: primaryColor }}>
                            <div className="h-2.5 w-10 rounded-sm bg-white/70" />
                            <div className="h-1.5 w-6 rounded-sm bg-white/50" />
                          </div>
                          <div className="p-1.5 space-y-1">
                            <div className="h-0.5 w-full rounded-sm" style={{ backgroundColor: primaryColor }} />
                            <div className="h-1 w-full bg-gray-200 rounded-sm" />
                            <div className="h-1 w-full bg-gray-200 rounded-sm" />
                            <div className="h-3 w-1/2 ml-auto rounded-sm" style={{ backgroundColor: `${primaryColor}22` }} />
                          </div>
                        </div>
                      )}
                      {tpl.id === 'elegant' && (
                        <div className="p-1.5">
                          <div className="flex flex-col items-center gap-0.5 py-1 border-y" style={{ borderColor: `${primaryColor}66` }}>
                            <div className="h-2 w-12 rounded-sm" style={{ backgroundColor: primaryColor }} />
                          </div>
                          <div className="mt-1.5 space-y-1">
                            <div className="h-1 w-full bg-gray-200 rounded-sm" />
                            <div className="h-1 w-full bg-gray-200 rounded-sm" />
                          </div>
                          <div className="h-3 w-full mt-1.5 rounded-sm" style={{ backgroundColor: primaryColor }} />
                        </div>
                      )}
                      {tpl.id === 'bold' && (
                        <div>
                          <div className="flex h-7">
                            <div className="w-1/2 bg-white flex items-center px-1">
                              <div className="h-2 w-6 rounded-sm bg-gray-300" />
                            </div>
                            <div className="w-1/2 flex items-center justify-end px-1" style={{ backgroundColor: primaryColor }}>
                              <div className="h-2 w-7 rounded-sm bg-white/80" />
                            </div>
                          </div>
                          <div className="h-1" style={{ backgroundColor: '#0f172a' }} />
                          <div className="p-1.5 space-y-1">
                            <div className="h-1.5 w-full rounded-sm bg-gray-200" style={{ borderLeft: `3px solid ${primaryColor}` }} />
                            <div className="h-1.5 w-full rounded-sm bg-gray-200" style={{ borderLeft: `3px solid ${primaryColor}` }} />
                            <div className="h-2.5 w-1/2 ml-auto rounded-sm" style={{ backgroundColor: '#0f172a' }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">{tpl.name}</span>
                      {selected && <span className="text-xs font-semibold" style={{ color: primaryColor }}>Selected</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{tpl.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-6">Brand Colors</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
                <div className="flex items-center space-x-3">
                  <input type="color" name="primary_color" value={formData.primary_color || '#000000'} onChange={handleInputChange} className="h-10 w-20 rounded border border-gray-300 cursor-pointer" />
                  <input type="text" value={formData.primary_color || '#000000'} onChange={(e) => setFormData(prev => ({ ...prev, primary_color: e.target.value }))} className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Color</label>
                <div className="flex items-center space-x-3">
                  <input type="color" name="secondary_color" value={formData.secondary_color || '#ffffff'} onChange={handleInputChange} className="h-10 w-20 rounded border border-gray-300 cursor-pointer" />
                  <input type="text" value={formData.secondary_color || '#ffffff'} onChange={(e) => setFormData(prev => ({ ...prev, secondary_color: e.target.value }))} className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
              </div>
            </div>

            {/* Color Preview */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-3">Preview</label>
              <div className="flex items-center space-x-4">
                <div
                  className="rounded-lg p-4 shadow-sm border"
                  style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                >
                  <span style={{ color: secondaryColor }} className="font-semibold">Primary with Secondary Text</span>
                </div>
                <div
                  className="rounded-lg p-4 shadow-sm border"
                  style={{ backgroundColor: secondaryColor, borderColor: primaryColor, borderWidth: '2px' }}
                >
                  <span style={{ color: primaryColor }} className="font-semibold">Secondary with Primary Text</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">These colors will be used in your quotations and invoices</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-2">Sidebar & Header Logo</h2>
            <p className="text-sm text-gray-500 mb-6">
              This thumbnail is shown in the sidebar's company switcher and the page header. The fixed
              quotation header logo is bundled in <code className="bg-gray-100 px-1 rounded">client/public/Company_Logos</code> and is not affected by uploads here.
            </p>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={handleLogoChange}
              className="hidden"
              id="logo-upload"
            />

            <div
              onDragEnter={handleLogoDragEnter}
              onDragOver={handleLogoDragOver}
              onDragLeave={handleLogoDragLeave}
              onDrop={handleLogoDrop}
              onClick={() => logoInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  logoInputRef.current?.click();
                }
              }}
              className={`relative cursor-pointer rounded-xl border-2 border-dashed p-6 transition-colors ${
                logoDragOver
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-300 hover:border-gray-400 bg-white'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Preview thumbnail (or empty placeholder) */}
                <div className="flex-shrink-0">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="h-24 w-24 object-contain rounded-lg border border-gray-200 bg-white"
                    />
                  ) : (
                    <div className="h-24 w-24 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Drop-zone copy + actions */}
                <div className="flex-1 text-center sm:text-left">
                  <p className="text-base font-semibold text-gray-900">
                    {logoDragOver
                      ? 'Release to use this image'
                      : logoPreview
                      ? 'Drag a new image here to replace, or click to browse'
                      : 'Drag an image here, or click to browse'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">PNG or JPG · up to 5 MB</p>
                  {logo && (
                    <p className="text-xs text-gray-600 mt-2 truncate" title={logo.name}>
                      Selected: <span className="font-medium">{logo.name}</span>
                    </p>
                  )}
                  {logoError && (
                    <p className="text-sm text-red-600 mt-2">{logoError}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation(); // prevent the wrapper's onClick
                    logoInputRef.current?.click();
                  }}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Choose File
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-6 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={isButtonHovered ? getButtonHoverStyle() : getButtonStyle()}
              onMouseEnter={() => setIsButtonHovered(true)}
              onMouseLeave={() => setIsButtonHovered(false)}
            >
              {loading ? 'Saving...' : <><Save className="h-4 w-4 mr-2" /> Save Settings</>}
            </button>
          </div>
        </form>
      ) : (
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
          <p className="text-gray-500">Select a company to edit its settings or create a new one.</p>
        </div>
      )}

      {/* Create Company Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Create New Company</h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X /></button>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Company Name</label>
              <input
                type="text"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter company name"
              />
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => setCreateModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancel</button>
              <button onClick={handleCreateCompany} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && companyToDelete && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-medium">Delete Company</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to delete "{companyToDelete.name}"? All associated data, including quotations, will be permanently removed. This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => setDeleteModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancel</button>
              <button onClick={handleDeleteCompany} disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;