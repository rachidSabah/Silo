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

  // New post form
  const [postType, setPostType] = useState('update');
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postCTA, setPostCTA] = useState('learn_more');
  const [postLink, setPostLink] = useState('');
  const [postStartDate, setPostStartDate] = useState('');

  const authFetch = useCallback((url: string, options?: RequestInit) => {
    return fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options?.headers },
    });
  }, [token]);

  // Load locations
  useEffect(() => {
    if (!project?.id) return;
    authFetch(`/api/gbp/locations?project_id=${project.id}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) { setLocations(data); if (data.length > 0) setSelectedLocation(data[0]); } })
      .catch(() => {});
  }, [project?.id, authFetch]);

  // Load posts/reviews when location changes
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

  // Create post
  const handleCreatePost = async () => {
    if (!selectedLocation || !postContent) return;
    try {
      const res = await authFetch('/api/gbp/posts', {
        method: 'POST',
        body: JSON.stringify({
          gbp_location_id: selectedLocation.id, project_id: project?.id,
          post_type: postType, title: postTitle || null, content: postContent,
          call_to_action: postCTA, link_url: postLink || null, start_date: postStartDate || null,
          end_date: null, status: 'draft',
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setPosts(prev => [{
          id: 'new', gbp_location_id: selectedLocation.id, post_type: postType,
          title: postTitle || null, content: postContent, status: 'draft',
          scheduled_at: postStartDate || null, published_at: null,
        }, ...prev]);
        setShowNewPost(false);
        setPostTitle(''); setPostContent(''); setPostLink(''); setPostStartDate('');
      }
    } catch (err) { console.error('Create post failed:', err); }
  };

  // Draft AI reply
  const handleDraftReply = async (review: GBPReview) => {
    setDraftingReply(review.id);
    try {
      const res = await authFetch('/api/gbp/reviews/draft-reply', {
        method: 'POST',
        body: JSON.stringify({
          review_text: review.review_text, rating: review.rating,
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">🏪 GBP Manager</h2>
        <p className="text-slate-400 text-sm mt-1">Manage Google Business Profile posts, reviews, and Q&A</p>
      </div>

      {/* Location Selector */}
      {locations.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {locations.map(loc => (
            <button key={loc.id} onClick={() => setSelectedLocation(loc)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedLocation?.id === loc.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}>
              {loc.location_name}
            </button>
          ))}
        </div>
      )}

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

          {/* Posts Tab */}
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
                  <div className="flex gap-2">
                    <button onClick={() => setShowNewPost(false)} className="px-4 py-1.5 bg-slate-700 text-white rounded-lg text-xs">Cancel</button>
                    <button onClick={handleCreatePost} disabled={!postContent} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs disabled:opacity-50">Save as Draft</button>
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

          {/* Reviews Tab */}
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
                  {review.review_text && <p className="text-slate-300 text-sm">"{review.review_text}"</p>}
                  
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

      {/* Empty state */}
      {locations.length === 0 && (
        <div className="text-center py-16 bg-slate-800/30 border border-slate-700/50 rounded-2xl">
          <div className="text-5xl mb-4">🏪</div>
          <h3 className="text-xl font-bold text-white mb-2">No GBP Locations</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto">Connect your Google Business Profile to manage posts, reviews, and Q&A across all your locations.</p>
        </div>
      )}
    </div>
  );
}
