'use client';

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@/store/useStore';

interface GBPLocation {
  id: string;
  location_name: string;
  address: string | null;
  phone: string | null;
  category: string | null;
  is_active: number;
  latitude?: number | null;
  longitude?: number | null;
  website_url?: string | null;
  oauth_connected?: boolean;
}

interface GBPPost {
  id: string;
  gbp_location_id: string;
  post_type: string;
  title: string | null;
  content: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
}

interface GBPReview {
  id: string;
  gbp_location_id: string;
  reviewer_name: string | null;
  rating: number | null;
  review_text: string | null;
  reply_text: string | null;
  ai_draft_reply: string | null;
  reply_status: string;
}

interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

const EMPTY_LOCATION_FORM = {
  location_name: '',
  address: '',
  phone: '',
  latitude: '',
  longitude: '',
  category: '',
  website_url: '',
};

export default function GBPManager() {
  const { project, token } = useStore();
  const [locations, setLocations] = useState<GBPLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<GBPLocation | null>(null);
  const [posts, setPosts] = useState<GBPPost[]>([]);
  const [reviews, setReviews] = useState<GBPReview[]>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'reviews'>('posts');
  const [loading, setLoading] = useState(false);
  const [showNewPost, setShowNewPost] = useState(false);
  const [draftingReply, setDraftingReply] = useState<string | null>(null);

  // OAuth state
  const [oauthTokens, setOauthTokens] = useState<OAuthTokens | null>(null);
  const [importingLocations, setImportingLocations] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Add location form
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [locationForm, setLocationForm] = useState(EMPTY_LOCATION_FORM);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationFormError, setLocationFormError] = useState<string | null>(null);

  // Deleting state
  const [deletingLocation, setDeletingLocation] = useState<string | null>(null);

  // New post form
  const [postType, setPostType] = useState('update');
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postCTA, setPostCTA] = useState('learn_more');
  const [postLink, setPostLink] = useState('');
  const [postStartDate, setPostStartDate] = useState('');
  const [publishToGoogle, setPublishToGoogle] = useState(false);

  const authFetch = useCallback((url: string, options?: RequestInit) => {
    return fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options?.headers },
    });
  }, [token]);

  // ─── OAuth: Parse tokens from URL hash on mount ─────────────────────
  useEffect(() => {
    const hash = window.location.hash.substring(1); // remove leading #
    const params = new URLSearchParams(hash);
    const accessToken = params.get('gbp_access_token');
    const refreshToken = params.get('gbp_refresh_token');
    const expiresIn = params.get('gbp_expires_in');

    if (accessToken && refreshToken && expiresIn) {
      const tokens: OAuthTokens = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: parseInt(expiresIn, 10),
      };
      setOauthTokens(tokens);
      // Clean the hash so tokens aren't lingering in the URL
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // ─── Load locations ─────────────────────────────────────────────────
  useEffect(() => {
    if (!project?.id) return;
    authFetch(`/api/gbp/locations?project_id=${project.id}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setLocations(data);
          if (data.length > 0 && !selectedLocation) setSelectedLocation(data[0]);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, authFetch]);

  // ─── Load posts/reviews when location changes ───────────────────────
  useEffect(() => {
    if (!selectedLocation) return;
    authFetch(`/api/gbp/posts?location_id=${selectedLocation.id}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPosts(data); })
      .catch(() => {});
    authFetch(`/api/gbp/reviews?location_id=${selectedLocation.id}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setReviews(data); })
      .catch(() => {});
  }, [selectedLocation, authFetch]);

  // ─── Connect GBP (OAuth redirect) ───────────────────────────────────
  const handleConnectGBP = () => {
    window.location.href = '/api/gbp-auth';
  };

  // ─── Import locations from Google API ───────────────────────────────
  const handleImportLocations = async () => {
    if (!oauthTokens || !project?.id) return;
    setImportingLocations(true);
    setImportError(null);
    try {
      const res = await authFetch('/api/gbp/fetch-locations', {
        method: 'POST',
        body: JSON.stringify({
          access_token: oauthTokens.access_token,
          project_id: project.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch locations from Google');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const googleLocations: any[] = Array.isArray(data.locations) ? data.locations : [];
      let imported = 0;
      for (const gl of googleLocations) {
        try {
          const saveRes = await authFetch('/api/gbp/locations', {
            method: 'POST',
            body: JSON.stringify({
              project_id: project.id,
              location_name: gl.name || gl.title || 'Unnamed Location',
              address: gl.formattedAddress || gl.address || null,
              phone: gl.primaryPhone || gl.phone || null,
              latitude: gl.latlng?.latitude || gl.latitude || null,
              longitude: gl.latlng?.longitude || gl.longitude || null,
              category: gl.primaryCategory?.displayName || gl.category || null,
              website_url: gl.websiteUri || gl.website_url || null,
              oauth_connected: true,
            }),
          });
          const saved = await saveRes.json();
          if (saved.ok || saved.id) imported++;
        } catch {
          // Skip individual failures
        }
      }

      // Refresh location list
      const locRes = await authFetch(`/api/gbp/locations?project_id=${project.id}`);
      const locData = await locRes.json();
      if (Array.isArray(locData)) {
        setLocations(locData);
        if (locData.length > 0 && !selectedLocation) setSelectedLocation(locData[0]);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportingLocations(false);
    }
  };

  // ─── Add location manually ──────────────────────────────────────────
  const handleAddLocation = async () => {
    if (!locationForm.location_name.trim() || !project?.id) {
      setLocationFormError('Location Name is required.');
      return;
    }
    setSavingLocation(true);
    setLocationFormError(null);
    try {
      const res = await authFetch('/api/gbp/locations', {
        method: 'POST',
        body: JSON.stringify({
          project_id: project.id,
          location_name: locationForm.location_name.trim(),
          address: locationForm.address.trim() || null,
          phone: locationForm.phone.trim() || null,
          latitude: locationForm.latitude ? parseFloat(locationForm.latitude) : null,
          longitude: locationForm.longitude ? parseFloat(locationForm.longitude) : null,
          category: locationForm.category.trim() || null,
          website_url: locationForm.website_url.trim() || null,
          oauth_connected: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save location');

      const newLoc: GBPLocation = {
        id: data.id || data.location?.id || `loc-${Date.now()}`,
        location_name: locationForm.location_name.trim(),
        address: locationForm.address.trim() || null,
        phone: locationForm.phone.trim() || null,
        category: locationForm.category.trim() || null,
        is_active: 1,
        latitude: locationForm.latitude ? parseFloat(locationForm.latitude) : null,
        longitude: locationForm.longitude ? parseFloat(locationForm.longitude) : null,
        website_url: locationForm.website_url.trim() || null,
        oauth_connected: false,
      };
      setLocations(prev => [...prev, newLoc]);
      setSelectedLocation(newLoc);
      setShowAddLocation(false);
      setLocationForm(EMPTY_LOCATION_FORM);
    } catch (err) {
      setLocationFormError(err instanceof Error ? err.message : 'Failed to save location');
    } finally {
      setSavingLocation(false);
    }
  };

  // ─── Delete location ────────────────────────────────────────────────
  const handleDeleteLocation = async (locId: string) => {
    if (!project?.id) return;
    setDeletingLocation(locId);
    try {
      await authFetch(`/api/gbp/locations?id=${locId}&project_id=${project.id}`, { method: 'DELETE' });
      setLocations(prev => prev.filter(l => l.id !== locId));
      if (selectedLocation?.id === locId) {
        setSelectedLocation(locations.find(l => l.id !== locId) || null);
      }
    } catch (err) {
      console.error('Delete location failed:', err);
    } finally {
      setDeletingLocation(null);
    }
  };

  // ─── Create post ────────────────────────────────────────────────────
  const handleCreatePost = async () => {
    if (!selectedLocation || !postContent) return;
    try {
      const res = await authFetch('/api/gbp/posts', {
        method: 'POST',
        body: JSON.stringify({
          gbp_location_id: selectedLocation.id,
          project_id: project?.id,
          post_type: postType,
          title: postTitle || null,
          content: postContent,
          call_to_action: postCTA,
          link_url: postLink || null,
          start_date: postStartDate || null,
          end_date: null,
          status: publishToGoogle && selectedLocation.oauth_connected ? 'publish' : 'draft',
          publish_to_google: publishToGoogle && selectedLocation.oauth_connected,
          access_token: publishToGoogle && selectedLocation.oauth_connected ? oauthTokens?.access_token : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setPosts(prev => [{
          id: 'new',
          gbp_location_id: selectedLocation.id,
          post_type: postType,
          title: postTitle || null,
          content: postContent,
          status: publishToGoogle && selectedLocation.oauth_connected ? 'published' : 'draft',
          scheduled_at: postStartDate || null,
          published_at: publishToGoogle ? new Date().toISOString() : null,
        }, ...prev]);
        setShowNewPost(false);
        setPostTitle('');
        setPostContent('');
        setPostLink('');
        setPostStartDate('');
        setPublishToGoogle(false);
      }
    } catch (err) { console.error('Create post failed:', err); }
  };

  // ─── Draft AI reply ─────────────────────────────────────────────────
  const handleDraftReply = async (review: GBPReview) => {
    setDraftingReply(review.id);
    try {
      const res = await authFetch('/api/gbp/reviews/draft-reply', {
        method: 'POST',
        body: JSON.stringify({
          review_text: review.review_text,
          rating: review.rating,
          reviewer_name: review.reviewer_name || 'Customer',
          business_name: selectedLocation?.location_name || project?.name || 'the business',
          tone: 'professional',
        }),
      });
      const data = await res.json();
      if (data.draft) {
        setReviews(prev => prev.map(r => r.id === review.id ? { ...r, ai_draft_reply: data.draft } : r));
      }
    } catch (err) { console.error('Draft reply failed:', err); }
    finally { setDraftingReply(null); }
  };

  // ─── Helpers ────────────────────────────────────────────────────────
  const isOAuthConnected = !!oauthTokens;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">🏪 GBP Manager</h2>
          <p className="text-slate-400 text-sm mt-1">Manage Google Business Profile locations, posts, reviews, and Q&A</p>
        </div>
        {isOAuthConnected && (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-emerald-300 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            OAuth Connected
          </span>
        )}
      </div>

      {/* ─── Location Management Toolbar ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleConnectGBP}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
          </svg>
          Connect GBP
        </button>

        <button
          onClick={() => { setShowAddLocation(true); setLocationFormError(null); }}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Location Manually
        </button>

        {isOAuthConnected && (
          <button
            onClick={handleImportLocations}
            disabled={importingLocations}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            {importingLocations ? 'Importing...' : 'Import from Google'}
          </button>
        )}
      </div>

      {/* Import error */}
      {importError && (
        <div className="px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
          {importError}
        </div>
      )}

      {/* ─── Add Location Modal ───────────────────────────────────── */}
      {showAddLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Add Location Manually</h3>
              <button onClick={() => { setShowAddLocation(false); setLocationForm(EMPTY_LOCATION_FORM); }} className="text-slate-400 hover:text-white text-xl">&times;</button>
            </div>

            {locationFormError && (
              <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs">{locationFormError}</div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Location Name <span className="text-red-400">*</span></label>
                <input
                  value={locationForm.location_name}
                  onChange={e => setLocationForm(f => ({ ...f, location_name: e.target.value }))}
                  placeholder="e.g. Downtown Coffee Shop"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Address</label>
                <input
                  value={locationForm.address}
                  onChange={e => setLocationForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="123 Main St, City, State ZIP"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Phone</label>
                  <input
                    value={locationForm.phone}
                    onChange={e => setLocationForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="(555) 123-4567"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Category</label>
                  <input
                    value={locationForm.category}
                    onChange={e => setLocationForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. Coffee Shop"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={locationForm.latitude}
                    onChange={e => setLocationForm(f => ({ ...f, latitude: e.target.value }))}
                    placeholder="40.7128"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={locationForm.longitude}
                    onChange={e => setLocationForm(f => ({ ...f, longitude: e.target.value }))}
                    placeholder="-74.0060"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Website URL</label>
                <input
                  value={locationForm.website_url}
                  onChange={e => setLocationForm(f => ({ ...f, website_url: e.target.value }))}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setShowAddLocation(false); setLocationForm(EMPTY_LOCATION_FORM); }}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddLocation}
                disabled={savingLocation || !locationForm.location_name.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingLocation ? 'Saving...' : 'Add Location'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Location List ────────────────────────────────────────── */}
      {locations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Locations</h3>
          <div className="flex gap-2 flex-wrap">
            {locations.map(loc => (
              <div key={loc.id} className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedLocation(loc)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    selectedLocation?.id === loc.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {loc.oauth_connected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="OAuth connected" />
                  )}
                  {loc.location_name}
                </button>
                <button
                  onClick={() => handleDeleteLocation(loc.id)}
                  disabled={deletingLocation === loc.id}
                  className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  title="Delete location"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Selected Location Detail ─────────────────────────────── */}
      {selectedLocation && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-800 p-1 rounded-lg w-fit">
            <button onClick={() => setActiveTab('posts')}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'posts' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>
              Posts ({posts.length})
            </button>
            <button onClick={() => setActiveTab('reviews')}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'reviews' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>
              Reviews ({reviews.length})
            </button>
          </div>

          {/* ─── Posts Tab ────────────────────────────────────────── */}
          {activeTab === 'posts' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={() => setShowNewPost(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs">+ New Post</button>
              </div>

              {showNewPost && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <select value={postType} onChange={e => setPostType(e.target.value)} className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm">
                      <option value="update">Update</option>
                      <option value="offer">Offer</option>
                      <option value="event">Event</option>
                    </select>
                    <select value={postCTA} onChange={e => setPostCTA(e.target.value)} className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm">
                      <option value="learn_more">Learn More</option>
                      <option value="book">Book</option>
                      <option value="order">Order</option>
                      <option value="sign_up">Sign Up</option>
                      <option value="call">Call</option>
                    </select>
                    <input value={postStartDate} onChange={e => setPostStartDate(e.target.value)} type="date" className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />
                  </div>
                  {postType !== 'update' && <input value={postTitle} onChange={e => setPostTitle(e.target.value)} placeholder="Post title" className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />}
                  <textarea value={postContent} onChange={e => setPostContent(e.target.value)} placeholder="Write your post content..." rows={3} className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />
                  <input value={postLink} onChange={e => setPostLink(e.target.value)} placeholder="Link URL (optional)" className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />

                  {/* Publish to Google checkbox - only shown when location has OAuth connected */}
                  {selectedLocation.oauth_connected && (
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={publishToGoogle}
                        onChange={e => setPublishToGoogle(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                      />
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                        Publish to Google
                      </span>
                      {publishToGoogle && (
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          Will publish immediately via API
                        </span>
                      )}
                    </label>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => { setShowNewPost(false); setPublishToGoogle(false); }} className="px-4 py-1.5 bg-slate-700 text-white rounded-lg text-xs">Cancel</button>
                    <button
                      onClick={handleCreatePost}
                      disabled={!postContent}
                      className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs disabled:opacity-50"
                    >
                      {publishToGoogle && selectedLocation.oauth_connected ? 'Publish to Google' : 'Save as Draft'}
                    </button>
                  </div>
                </div>
              )}

              {posts.length === 0 ? (
                <div className="text-center py-8 bg-slate-800/30 rounded-xl border border-slate-700/50">
                  <p className="text-slate-400 text-sm">No posts yet. Create your first GBP post!</p>
                </div>
              ) : posts.map(post => (
                <div key={post.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500 uppercase">{post.post_type}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${post.status === 'draft' ? 'bg-slate-700 text-slate-300' : post.status === 'published' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>{post.status}</span>
                  </div>
                  {post.title && <p className="text-white text-sm font-medium">{post.title}</p>}
                  <p className="text-slate-400 text-xs mt-1 line-clamp-2">{post.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* ─── Reviews Tab ──────────────────────────────────────── */}
          {activeTab === 'reviews' && (
            <div className="space-y-3">
              {reviews.length === 0 ? (
                <div className="text-center py-8 bg-slate-800/30 rounded-xl border border-slate-700/50">
                  <p className="text-slate-400 text-sm">No reviews loaded. Connect your GBP to fetch reviews.</p>
                </div>
              ) : reviews.map(review => (
                <div key={review.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">{review.reviewer_name || 'Anonymous'}</span>
                      <span className="text-amber-400 text-xs">{'★'.repeat(review.rating || 0)}{'☆'.repeat(5 - (review.rating || 0))}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${review.reply_status === 'replied' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>{review.reply_status}</span>
                  </div>
                  {review.review_text && <p className="text-slate-300 text-sm">&ldquo;{review.review_text}&rdquo;</p>}

                  {review.reply_text && (
                    <div className="bg-slate-700/30 rounded p-2 border-l-2 border-blue-500">
                      <p className="text-[10px] text-slate-500 mb-1">Your Reply:</p>
                      <p className="text-slate-300 text-xs">{review.reply_text}</p>
                    </div>
                  )}

                  {review.ai_draft_reply && !review.reply_text && (
                    <div className="bg-blue-500/10 rounded p-2 border-l-2 border-blue-500">
                      <p className="text-[10px] text-blue-400 mb-1">🤖 AI Draft Reply:</p>
                      <p className="text-blue-200 text-xs">{review.ai_draft_reply}</p>
                    </div>
                  )}

                  {!review.reply_text && (
                    <button
                      onClick={() => handleDraftReply(review)}
                      disabled={draftingReply === review.id}
                      className="px-3 py-1 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded text-xs hover:bg-blue-600/30 disabled:opacity-50"
                    >
                      {draftingReply === review.id ? '🤖 Generating...' : '🤖 AI Draft Reply'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── Empty State ──────────────────────────────────────────── */}
      {locations.length === 0 && (
        <div className="text-center py-16 bg-slate-800/30 border border-slate-700/50 rounded-2xl">
          <div className="text-5xl mb-4">🏪</div>
          <h3 className="text-xl font-bold text-white mb-2">No GBP Locations</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">
            Connect your Google Business Profile to manage posts, reviews, and Q&A across all your locations.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleConnectGBP}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              Connect GBP via OAuth
            </button>
            <button
              onClick={() => { setShowAddLocation(true); setLocationFormError(null); }}
              className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition-colors"
            >
              Add Location Manually
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
